import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isValidLicenseKeyShape, signLicenseJWT } from "@/lib/license";

export const runtime = "nodejs";

const RequestSchema = z.object({
  license_key: z.string().trim(),
  machine_id: z.string().min(8).max(128),
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

  const activations = await db
    .select()
    .from(schema.activations)
    .where(
      and(
        eq(schema.activations.licenseId, license.id),
        eq(schema.activations.machineId, parsed.machine_id),
      ),
    )
    .limit(1);
  const activation = activations[0];
  if (!activation) {
    return NextResponse.json(
      { error: "machine not activated for this license" },
      { status: 404 },
    );
  }
  if (activation.revokedAt) {
    return NextResponse.json({ error: "activation revoked" }, { status: 410 });
  }

  await db
    .update(schema.activations)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.activations.id, activation.id));

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
  });
}
