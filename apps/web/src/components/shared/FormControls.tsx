"use client";

import { useId } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Option } from "./Controls";

export function TextField({
  label,
  value,
  onChange,
  multiline,
  disabled,
  required,
  type,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
}) {
  const id = useId();
  const props = {
    id,
    value,
    disabled,
    readOnly,
    "aria-required": required,
    name: id,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? <Textarea {...props} /> : <Input {...props} type={type} />}
    </Field>
  );
}

export function MultiChoice({
  legend,
  options,
  selected,
  onChange,
  disabled,
}: {
  legend: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-1">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map(({ value, label }) => (
        <Label
          key={value}
          className="min-h-11 cursor-pointer rounded-md border bg-card px-2 py-1 [overflow-wrap:anywhere]"
        >
          <Checkbox
            checked={selected.includes(value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, value] : selected.filter((item) => item !== value))
            }
          />
          {label}
        </Label>
      ))}
    </fieldset>
  );
}
