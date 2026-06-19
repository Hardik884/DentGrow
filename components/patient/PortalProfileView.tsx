"use client";

import { useState, useTransition } from "react";
import {
  updatePortalProfile,
  type PortalPatientProfile,
} from "@/actions/portal-link";
import { formatDate, calculateAge } from "@/lib/utils";

interface PortalProfileViewProps {
  profile: PortalPatientProfile;
}

/**
 * PortalProfileView
 *
 * Patient portal — read-only profile view with inline edit for allowed fields.
 *
 * Read-only (clinical/system):
 *   name, date_of_birth, gender, total_visits, last_visit
 *
 * Editable:
 *   phone, address, emergency_contact_name, emergency_contact_phone
 */
export function PortalProfileView({ profile }: PortalProfileViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [emergencyName, setEmergencyName] = useState(
    profile.emergency_contact_name ?? ""
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    profile.emergency_contact_phone ?? ""
  );

  function handleCancel() {
    // Reset to server values
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setEmergencyName(profile.emergency_contact_name ?? "");
    setEmergencyPhone(profile.emergency_contact_phone ?? "");
    setError(null);
    setIsEditing(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updatePortalProfile({
        phone: phone || undefined,
        address: address || undefined,
        emergency_contact_name: emergencyName || undefined,
        emergency_contact_phone: emergencyPhone || undefined,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
      setIsEditing(false);
    });
  }

  const age = calculateAge(profile.date_of_birth);

  return (
    <div className="space-y-5">
      {/* Identity card — read-only */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-700 font-bold text-xl">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">{profile.name}</p>
            {age !== null && (
              <p className="text-sm text-gray-500">
                {age} years old
                {profile.gender ? ` · ${GENDER_LABEL[profile.gender]}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t text-sm">
          <InfoRow label="Date of Birth" value={formatDate(profile.date_of_birth)} />
          <InfoRow label="Total Visits" value={String(profile.total_visits)} />
          <InfoRow
            label="Last Visit"
            value={profile.last_visit ? formatDate(profile.last_visit) : "Never"}
          />
          <InfoRow
            label="Member Since"
            value={formatDate(profile.created_at)}
          />
        </div>

        <p className="text-xs text-gray-400 pt-1">
          Name, date of birth, and gender are managed by your clinic.
        </p>
      </div>

      {/* Saved notice */}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          Profile updated successfully.
        </div>
      )}

      {/* Editable contact details */}
      <form onSubmit={handleSave}>
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Contact Information</h2>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => { setIsEditing(true); setSaved(false); }}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isPending}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="space-y-3">
            <EditableField
              label="Phone Number"
              value={phone}
              onChange={setPhone}
              isEditing={isEditing}
              disabled={isPending}
              type="tel"
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
            <EditableField
              label="Address"
              value={address}
              onChange={setAddress}
              isEditing={isEditing}
              disabled={isPending}
              placeholder="Enter your address"
              multiline
            />
          </div>
        </div>

        {/* Emergency contact — separate card */}
        <div className="bg-white border rounded-xl p-5 space-y-3 mt-5">
          <h2 className="font-semibold text-gray-900">Emergency Contact</h2>
          <div className="space-y-3">
            <EditableField
              label="Name"
              value={emergencyName}
              onChange={setEmergencyName}
              isEditing={isEditing}
              disabled={isPending}
              placeholder="Emergency contact name"
            />
            <EditableField
              label="Phone"
              value={emergencyPhone}
              onChange={setEmergencyPhone}
              isEditing={isEditing}
              disabled={isPending}
              type="tel"
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-gray-900 mt-0.5">{value || "—"}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  isEditing,
  disabled,
  type = "text",
  placeholder,
  multiline = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isEditing: boolean;
  disabled: boolean;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      {isEditing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 resize-none"
          />
        ) : (
          <input
            type={type}
            inputMode={inputMode}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50"
          />
        )
      ) : (
        <p className="text-sm text-gray-900">{value || <span className="text-gray-400">—</span>}</p>
      )}
    </div>
  );
}

const GENDER_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};
