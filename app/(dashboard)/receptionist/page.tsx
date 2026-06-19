import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TodayAppointmentList } from "@/components/receptionist/TodayAppointmentList";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PatientSearchBar } from "@/components/receptionist/PatientSearchBar";

export const metadata: Metadata = {
  title: "Dashboard — DentGrow",
};

/**
 * /receptionist
 * Receptionist dashboard — operational front-desk view.
 *
 * Displays:
 * - Prominent patient search bar
 * - Today's appointment list with status badges
 * - Live queue widget
 * - Patients with pending payments
 */
export default async function ReceptionistDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Dashboard" />

      {/* Prominent patient search — primary tool for receptionists */}
      <PatientSearchBar />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TodayAppointmentList />
          <PendingPaymentsList />
        </div>

        <div>
          {/* Live queue widget */}
          <QueueWidget />
        </div>
      </div>
    </div>
  );
}
