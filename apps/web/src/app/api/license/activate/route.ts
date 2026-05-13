import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  isValidLicenseKeyShape,
  signLicenseJWT,
  MAX_ACTIVATIONS_PER_LICENSE,
} from "@/lib/license";

export const runtime = "nodejs";

const RequestSchema = z.object({
  license_key: z.string().trim(),
  machine_id: z.string().min(8).max(128),
  machine_name: z.string().min(1).max(128).optional(),
  app_build_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }
  const key = parsed.license_key.toUpperCase();
  if (!isValidLicenseKeyShape(key)) {
    return NextResponse.json({ error: "malformed license key" }, { status: 400 });
  }

  const db = getDb();
  const found = await db
    .select()
    .from(schema.licenses)
    .where(eq(schema.licenses.key, key))
    .limit(1);
  const license = found[0];
  if (!license) {
    return NextResponse.json({ error: "license not found" }, { status: 404 });
  }
  if (license.revokedAt) {
    return NextResponse.json({ error: "license revoked" }, { status: 410 });
  }

  const buildDate = new Date(parsed.app_build_date + "T00:00:00Z");
  if (buildDate > license.updateWindowExpiresAt) {
    return NextResponse.json(
      {
        error: "build_outside_update_window",
        message: `This license entitles you to updates released on or before ${license.updateWindowExpiresAt
          .toISOString()
          .slice(0, 10)}.`,
      },
      { status: 403 },
    );
  }

  const existingActivation = await db
    .select()
    .from(schema.activations)
    .where(
      and(
        eq(schema.activations.licenseId, license.id),
        eq(schema.activations.machineId, parsed.machine_id),
      ),
    )
    .limit(1);

  const now = new Date();

  if (existingActivation.length > 0) {
    const row = existingActivation[0]!;
    if (row.revokedAt) {
      return NextResponse.json({ error: "activation revoked" }, { status: 410 });
    }
    await db
      .update(schema.activations)
      .set({
        lastSeenAt: now,
        machineName: parsed.machine_name ?? row.machineName,
        appBuildDate: parsed.app_build_date,
      })
      .where(eq(schema.activations.id, row.id));
  } else {
    const activeCountRows = await db
      .select({ id: schema.activations.id })
      .from(schema.activations)
      .where(
        and(
          eq(schema.activations.licenseId, license.id),
          isNull(schema.activations.revokedAt),
        ),
      );
    if (activeCountRows.length >= MAX_ACTIVATIONS_PER_LICENSE) {
      return NextResponse.json(
        {
          error: "activation_limit_reached",
          message: `This license is already active on ${activeCountRows.length} machine(s) (limit ${MAX_ACTIVATIONS_PER_LICENSE}).`,
        },
        { status: 403 },
      );
    }
    await db.insert(schema.activations).values({
      licenseId: license.id,
      machineId: parsed.machine_id,
      machineName: parsed.machine_name ?? null,
      appBuildDate: parsed.app_build_date,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  const jwt = await signLicenseJWT({
    licenseKey: license.key,
    machineId: parsed.machine_id,
    email: license.email,
    updateWindowExpiresAt: Math.floor(license.updateWindowExpiresAt.getTime() / 1000),
  });

  return NextResponse.json({
    jwt,
    license_key: license.key,
    email: license.email,
    update_window_expires_at: license.updateWindowExpiresAt.toISOString(),
    machines_allowed: MAX_ACTIVATIONS_PER_LICENSE,
  });
}
