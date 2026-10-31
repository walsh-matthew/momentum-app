// The other half of the main-button rule (MOM-145): a form with several fields keeps its button visible and solid. A tap with something
// missing sends nothing, shows a plain callout that names what is missing, and moves focus to it. Pure: it reads a form's values and says
// what is missing first; components/ui/MissingCallout.tsx shows it.

export interface RequiredField {
  // The field's name in the form.
  name: string;
  // What to call it in the callout, after "Enter" or "Choose": "your email", "a new password".
  what: string;
  // The least length of a value that counts, when more than one character (a password).
  minLength?: number;
  // The verb for the callout; "Enter" unless the field is a choice.
  verb?: 'Enter' | 'Choose';
}

export interface Missing {
  name: string;
  message: string;
}

// The first required field with no usable value, in the order given (the order on the screen), or null when nothing is missing.
export function firstMissing(values: ReadonlyMap<string, string>, fields: readonly RequiredField[]): Missing | null {
  for (const field of fields) {
    const value = (values.get(field.name) ?? '').trim();
    if (value.length === 0) return { name: field.name, message: `${field.verb ?? 'Enter'} ${field.what} to continue.` };
    if (field.minLength !== undefined && value.length < field.minLength) {
      return { name: field.name, message: `${field.what[0].toUpperCase()}${field.what.slice(1)} needs at least ${field.minLength} characters.` };
    }
  }
  return null;
}

// The values of a form's named fields.
export function formValues(form: HTMLFormElement): Map<string, string> {
  const values = new Map<string, string>();
  for (const [name, value] of new FormData(form).entries()) if (typeof value === 'string') values.set(name, value);
  return values;
}

// Checks a form and, when something is missing, focuses that field. Returns what is missing, or null.
export function checkForm(form: HTMLFormElement, fields: readonly RequiredField[]): Missing | null {
  const missing = firstMissing(formValues(form), fields);
  if (missing) {
    const field = form.elements.namedItem(missing.name);
    if (field instanceof HTMLElement) field.focus();
  }
  return missing;
}
