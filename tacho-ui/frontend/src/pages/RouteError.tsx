import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function RouteError() {
  const error = useRouteError();

  let title = "Something went wrong";
  let body: string;

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    body = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  } else if (error instanceof Error) {
    body = error.message;
  } else {
    body = String(error);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{body}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="self-start">
        <Link to="/">Back to drivers</Link>
      </Button>
    </div>
  );
}
