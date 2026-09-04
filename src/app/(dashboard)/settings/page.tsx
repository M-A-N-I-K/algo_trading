import { Settings } from "lucide-react";
import PlaceholderPage from "@/components/layout/PlaceholderPage";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      icon={Settings}
      title="Settings"
      description="Account, trading-account, and notification preferences will live here as the platform grows beyond a single default account."
      plannedCapabilities={[
        "Manage multiple trading accounts",
        "Default currency & risk preferences",
        "Notification preferences",
        "Data export",
      ]}
    />
  );
}
