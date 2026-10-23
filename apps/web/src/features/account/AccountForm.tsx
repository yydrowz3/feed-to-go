import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { isCancellation } from "../../api/client";
import { FormField } from "../../components/FormField";

export function AccountForm({
  fields,
  submitLabel,
  onSubmit,
}: {
  fields: {
    name: string;
    label: string;
    password?: boolean;
    initial?: string;
    autoComplete?: string;
  }[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: Object.fromEntries(fields.map((field) => [field.name, field.initial ?? ""])),
    validators: {
      onSubmit: z.object(
        Object.fromEntries(
          fields.map((field) => [field.name, z.string().trim().min(1, `请输入${field.label}`)]),
        ),
      ),
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await onSubmit(value);
        fields
          .filter((field) => field.password)
          .forEach((field) => form.setFieldValue(field.name, ""));
      } catch (cause) {
        if (!isCancellation(cause))
          setError(cause instanceof Error ? cause.message : "操作失败，请重试");
      }
    },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => (
          <fieldset disabled={busy} className="grid gap-4">
            {fields.map((item) => (
              <form.Field key={item.name} name={item.name}>
                {(field) => (
                  <FormField
                    id={`account-${item.name}`}
                    label={item.label}
                    errors={field.state.meta.errors}
                  >
                    <input
                      id={`account-${item.name}`}
                      name={item.name}
                      type={item.password ? "password" : "text"}
                      autoComplete={item.autoComplete}
                      className="input w-full"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={
                        field.state.meta.errors.length ? `account-${item.name}-error` : undefined
                      }
                    />
                  </FormField>
                )}
              </form.Field>
            ))}
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "提交中…" : submitLabel}
            </button>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  );
}
