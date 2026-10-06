import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getPreference } from "@/server/server-actions";
import { Coque } from "./_coque/coque";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([getPreference("sidebar_variant"), getPreference("sidebar_collapsible")]);
  return (
    <Coque defaultOpen={defaultOpen} variant={variant} collapsible={collapsible}>
      {children}
    </Coque>
  );
}
