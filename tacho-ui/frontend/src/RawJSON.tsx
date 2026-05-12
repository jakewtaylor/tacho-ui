import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function RawJSON({ json }: { json: string }) {
  const [show, setShow] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShow((v) => !v)}
        className="self-start"
      >
        {show ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
        {show ? "Hide" : "Show"} raw JSON ({json.length.toLocaleString()} bytes)
      </Button>
      {show && (
        <Card>
          <CardContent className="px-0">
            <ScrollArea className="h-[60vh]">
              <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre">
                {json}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
