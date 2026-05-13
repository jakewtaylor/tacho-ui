import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Info, ShieldAlert, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@tacholens/ui/components/alert";
import { Badge } from "@tacholens/ui/components/badge";
import { Card, CardContent } from "@tacholens/ui/components/card";
import { cn } from "@tacholens/ui/lib/utils";
import {
  countInfringements,
  type Infringement,
  type Severity,
} from "./infringements";

type Props = {
  items: Infringement[];
  /** Section heading. Defaults to "Infringements". */
  title?: string;
  /** Suppress the "compliant" card when there are no infringements. */
  hideWhenEmpty?: boolean;
  /** When true, dates in each row link to /driver/:cardNumber/day/:date. Defaults to true. */
  linkDates?: boolean;
};

const SEVERITY: Record<
  Severity,
  {
    Icon: typeof TriangleAlert;
    badgeVariant: "destructive" | "outline" | "secondary";
    container: string;
    label: string;
  }
> = {
  breach: {
    Icon: ShieldAlert,
    badgeVariant: "destructive",
    container: "border-destructive/40 bg-destructive/5 text-foreground",
    label: "Breach",
  },
  warning: {
    Icon: TriangleAlert,
    badgeVariant: "outline",
    container: "border-amber-400/40 bg-amber-400/5 text-foreground",
    label: "Warning",
  },
  info: {
    Icon: Info,
    badgeVariant: "secondary",
    container: "border-border bg-card text-foreground",
    label: "Info",
  },
};

export function InfringementsPanel({
  items,
  title = "Infringements",
  hideWhenEmpty,
  linkDates = true,
}: Props) {
  const { cardNumber } = useParams<{ cardNumber?: string }>();
  const counts = countInfringements(items);

  if (counts.total === 0) {
    if (hideWhenEmpty) return null;
    return (
      <section className="flex flex-col gap-2">
        <SectionTitle title={title} />
        <Alert className="border-emerald-500/40 bg-emerald-500/5">
          <CheckCircle2 className="text-emerald-400" />
          <AlertTitle className="text-emerald-300">Compliant</AlertTitle>
          <AlertDescription>
            No driver-hours infringements detected in this period.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle title={title} />
        <div className="flex items-center gap-2">
          {counts.breach > 0 && (
            <Badge variant="destructive">
              {counts.breach} breach{counts.breach === 1 ? "" : "es"}
            </Badge>
          )}
          {counts.warning > 0 && (
            <Badge variant="outline">
              {counts.warning} warning{counts.warning === 1 ? "" : "s"}
            </Badge>
          )}
          {counts.info > 0 && (
            <Badge variant="secondary">{counts.info} info</Badge>
          )}
        </div>
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          {items.map((it, i) => {
            const s = SEVERITY[it.severity];
            const Icon = s.Icon;
            return (
              <Alert
                key={`${it.code}-${it.date ?? ""}-${i}`}
                className={cn("text-sm", s.container)}
              >
                <Icon />
                <AlertTitle className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>{it.title}</span>
                  {it.date && cardNumber && linkDates ? (
                    <Link
                      to={`/driver/${cardNumber}/day/${it.date}`}
                      className="font-mono text-[0.7rem] text-muted-foreground hover:text-foreground"
                    >
                      {it.date} →
                    </Link>
                  ) : it.date ? (
                    <span className="font-mono text-[0.7rem] text-muted-foreground">
                      {it.date}
                    </span>
                  ) : null}
                </AlertTitle>
                <AlertDescription>
                  <p>{it.description}</p>
                  {it.ruleRef && (
                    <p className="mt-1 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      {it.ruleRef}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h2>
  );
}
