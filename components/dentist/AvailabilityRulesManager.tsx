"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createAvailabilityRule,
  updateAvailabilityRule,
  toggleAvailabilityRule,
} from "@/actions/availability";
import {
  CreateAvailabilityRuleSchema,
  type CreateAvailabilityRuleInput,
  type AvailabilityRule,
} from "@/types";
import { cn, formatTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Pencil, Calendar } from "lucide-react";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

interface AvailabilityRulesManagerProps {
  initialRules: AvailabilityRule[];
}

export function AvailabilityRulesManager({ initialRules }: AvailabilityRulesManagerProps) {
  const [rules, setRules] = useState<AvailabilityRule[]>(initialRules);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createForm = useForm<CreateAvailabilityRuleInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateAvailabilityRuleSchema) as any,
    defaultValues: { day_of_week: 1, start_time: "09:00", end_time: "18:00", slot_duration_minutes: 30, is_active: true },
  });

  const editForm = useForm<CreateAvailabilityRuleInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(CreateAvailabilityRuleSchema) as any,
  });

  async function handleCreate(values: CreateAvailabilityRuleInput) {
    setGlobalError(null);
    const result = await createAvailabilityRule(values);
    if (result.error) { createForm.setError("root", { message: result.error }); return; }
    if (result.data) {
      setRules((prev) => [...prev, result.data!].sort(sortRules));
    }
    createForm.reset();
    setShowAddForm(false);
  }

  function handleToggle(rule: AvailabilityRule) {
    startTransition(async () => {
      setGlobalError(null);
      const result = await toggleAvailabilityRule(rule.id, !rule.is_active);
      if (result.error) { setGlobalError(result.error); return; }
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    });
  }

  function startEdit(rule: AvailabilityRule) {
    setEditingId(rule.id);
    editForm.reset({
      day_of_week: rule.day_of_week,
      start_time: rule.start_time.slice(0, 5),
      end_time: rule.end_time.slice(0, 5),
      slot_duration_minutes: rule.slot_duration_minutes,
      is_active: rule.is_active,
    });
  }

  async function handleUpdate(values: CreateAvailabilityRuleInput) {
    if (!editingId) return;
    setGlobalError(null);
    const result = await updateAvailabilityRule(editingId, values);
    if (result.error) { editForm.setError("root", { message: result.error }); return; }
    if (result.data) {
      setRules((prev) => prev.map((r) => r.id === editingId ? result.data! : r).sort(sortRules));
    }
    setEditingId(null);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {globalError && (
        <div role="alert" className="rounded-lg bg-danger-bg border border-danger-border px-4 py-3 text-xs text-danger">
          {globalError}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Availability Rules</h2>
            <p className="text-xs text-text-secondary mt-0.5">{rules.length} rule{rules.length !== 1 ? "s" : ""} configured</p>
          </div>
          <Button
            size="sm"
            onClick={() => { setShowAddForm(true); setEditingId(null); }}
            disabled={isPending}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Rule
          </Button>
        </div>

        {rules.length === 0 && !showAddForm ? (
          <EmptyState
            icon={<Calendar className="h-5 w-5" aria-hidden />}
            title="No availability rules"
            description="Add rules to define when appointments can be booked."
          />
        ) : (
          <div className="divide-y divide-surface-muted">
            {rules.map((rule) => (
              <div key={rule.id}>
                {editingId === rule.id ? (
                  <div className="px-5 py-4">
                    <form onSubmit={editForm.handleSubmit(handleUpdate)}>
                      <RuleFormFields form={editForm} onCancel={() => setEditingId(null)} submitLabel="Save" />
                    </form>
                  </div>
                ) : (
                  <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggle(rule)}
                        disabled={isPending}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          "disabled:cursor-not-allowed",
                          rule.is_active ? "bg-accent" : "bg-border"
                        )}
                        aria-pressed={rule.is_active}
                        aria-label={`${DAY_LABELS[rule.day_of_week]}: ${rule.is_active ? "active" : "inactive"}`}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-4 w-4 rounded-full bg-surface shadow transform transition-transform",
                          rule.is_active ? "translate-x-4" : "translate-x-0"
                        )} />
                      </button>

                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {DAY_LABELS[rule.day_of_week]}
                          {" "}
                          <span className="font-normal text-text-secondary">
                            {formatTime(rule.start_time)} – {formatTime(rule.end_time)}
                          </span>
                        </p>
                        <p className="text-xs text-text-disabled">
                          {rule.slot_duration_minutes} min slots ·{" "}
                          <span className={rule.is_active ? "text-success" : "text-text-disabled"}>
                            {rule.is_active ? "Active" : "Inactive"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(rule)}
                      disabled={isPending}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddForm && (
          <div className="px-5 py-4 border-t border-border bg-background">
            <p className="text-xs font-semibold text-text-primary mb-3">New Rule</p>
            <form onSubmit={createForm.handleSubmit(handleCreate)}>
              <RuleFormFields
                form={createForm}
                onCancel={() => { setShowAddForm(false); createForm.reset(); }}
                submitLabel="Add Rule"
              />
            </form>
          </div>
        )}
      </div>

      <p className="text-xs text-text-secondary">
        Changes take effect immediately — available booking slots update automatically.
      </p>
    </div>
  );
}

// ── Shared rule form ─────────────────────────────────────────────────────────

function RuleFormFields({
  form,
  onCancel,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<CreateAvailabilityRuleInput>>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { register, formState: { errors, isSubmitting } } = form;

  return (
    <div className="space-y-4">
      {form.formState.errors.root && (
        <p className="text-xs text-danger" role="alert">{form.formState.errors.root.message}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Day" htmlFor="form-day">
          <Select
            id="form-day"
            {...register("day_of_week", { valueAsNumber: true })}
            disabled={isSubmitting}
            hasError={!!errors.day_of_week}
          >
            {Object.entries(DAY_LABELS).map(([val, label]) => (
              <option key={val} value={Number(val)}>{label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Start Time" error={(errors as Record<string, {message?: string}>).start_time?.message}>
          <Input type="time" {...register("start_time")} disabled={isSubmitting} />
        </Field>

        <Field label="End Time" error={(errors as Record<string, {message?: string}>).end_time?.message}>
          <Input type="time" {...register("end_time")} disabled={isSubmitting} />
        </Field>

        <Field label="Slot (min)">
          <Select {...register("slot_duration_minutes", { valueAsNumber: true })} disabled={isSubmitting}>
            {[10, 15, 20, 30, 45, 60].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function sortRules(a: AvailabilityRule, b: AvailabilityRule) {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
  return a.start_time.localeCompare(b.start_time);
}
