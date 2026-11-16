import { registerEn } from "../registry";

/** Settings page. */
export const settings = {
  title: "Settings",
  subtitle: "How WealthKart keeps in touch on this device.",
  reminders: "Reminders",
  remindersPerCircle: "Reminders per circle",
  loadingCircles: "Loading your circles",
  noCircles: "You're not in a circle yet. Once you join one, you can choose its reminders here.",
  off: "Off",
  allOn: "All reminders on",
  someOn: "{count} of {total} reminders on",
  chooseWhich: "Choose which",
  circlesNoun: "circles",
} as const;

registerEn("settings", settings);
