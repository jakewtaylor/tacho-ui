import * as React from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { CalendarRange, IdCard, Upload, Users } from "lucide-react";

import appIcon from "../src/assets/images/appicon.png";

import { Button } from "@tacholens/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@tacholens/ui/sidebar";
import { Skeleton } from "@tacholens/ui/skeleton";
import type { db } from "../wailsjs/go/models";

type Props = React.ComponentProps<typeof Sidebar> & {
  drivers: db.DriverSummary[] | null;
  triggerImport: () => void;
  importing: boolean;
};

export function AppSidebar({
  drivers,
  triggerImport,
  importing,
  ...props
}: Props) {
  const { cardNumber } = useParams<{ cardNumber?: string }>();
  const location = useLocation();

  const activeDriver = React.useMemo(() => {
    if (!cardNumber || !drivers) return null;
    return drivers.find((d) => d.cardNumber === cardNumber) ?? null;
  }, [cardNumber, drivers]);

  const activeDriverName = activeDriver
    ? [activeDriver.firstNames, activeDriver.surname]
        .filter(Boolean)
        .join(" ") || activeDriver.cardNumber
    : null;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <img
            src={appIcon}
            alt=""
            aria-hidden
            className="size-12 rounded-md"
          />
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">TachoLens</span>
            <span className="truncate text-xs text-muted-foreground">
              Driver-card viewer
            </span>
          </div>
        </div>
        <div className="px-2 group-data-[collapsible=icon]:hidden">
          <Button
            onClick={triggerImport}
            disabled={importing}
            className="w-full justify-start"
            size="sm"
          >
            <Upload data-icon="inline-start" />
            {importing ? "Importing…" : "Import .ddd file"}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/"}
                  tooltip="Drivers"
                >
                  <NavLink to="/" end>
                    <Users />
                    <span>Drivers</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeDriver && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="truncate">
                {activeDriverName ?? "Driver"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        location.pathname ===
                        `/driver/${activeDriver.cardNumber}`
                      }
                      tooltip="Overview"
                    >
                      <NavLink to={`/driver/${activeDriver.cardNumber}`} end>
                        <IdCard />
                        <span>Overview</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname.startsWith(
                        `/driver/${activeDriver.cardNumber}/weeks`,
                      )}
                      tooltip="Weekly summary"
                    >
                      <NavLink to={`/driver/${activeDriver.cardNumber}/weeks`}>
                        <CalendarRange />
                        <span>Weeks</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {drivers && drivers.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>All drivers</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {drivers.map((d) => {
                    const name =
                      [d.firstNames, d.surname].filter(Boolean).join(" ") ||
                      d.cardNumber;
                    return (
                      <SidebarMenuItem key={d.cardNumber}>
                        <SidebarMenuButton
                          asChild
                          isActive={d.cardNumber === cardNumber}
                          tooltip={name}
                        >
                          <NavLink to={`/driver/${d.cardNumber}`}>
                            <span className="truncate">{name}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {drivers === null && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupContent className="flex flex-col gap-2 px-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-[0.65rem] leading-relaxed text-muted-foreground">
          Drop a <code className="rounded bg-muted px-1">.ddd</code> file
          anywhere in the window to import.
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
