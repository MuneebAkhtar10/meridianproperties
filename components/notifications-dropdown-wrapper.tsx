"use client";

import dynamic from "next/dynamic";

// Dynamically import the NotificationsDropdown with no SSR
const NotificationsDropdown = dynamic(
  () =>
    import("./notifications-dropdown").then((mod) => mod.NotificationsDropdown),
  { ssr: false },
);

export function NotificationsDropdownWrapper() {
  return <NotificationsDropdown />;
}
