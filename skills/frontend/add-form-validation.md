---
name: add-form-validation
description: Add client-side form validation with error messages
argument-hint: [library: react-hook-form|formik|vee-validate] [schema: zod|yup|joi]
tags: [frontend, forms, validation, react-hook-form, zod, yup]
---

# Form Validation Guide

Use schema validation (Zod/Yup) with form libraries (React Hook Form/Formik) for type-safe, declarative validation.

---

## React Hook Form + Zod

```bash
npm install react-hook-form @hookform/resolvers zod
```

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const candidateSchema = z.object({
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  email: z.string().email('Email invalide'),
  phone: z.string().regex(/^\+?[\d\s-]{8,15}$/, 'Numero invalide').optional().or(z.literal('')),
  yearsOfExperience: z.number().min(0).max(50),
  skills: z.array(z.string()).min(1, 'Au moins une competence requise'),
  salary: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  }).refine(d => d.max >= d.min, { message: 'Max doit etre >= min', path: ['max'] }),
});

type CandidateFormData = z.infer<typeof candidateSchema>;

function CandidateForm({ onSubmit }: { onSubmit: (data: CandidateFormData) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CandidateFormData>({
    resolver: zodResolver(candidateSchema),
    defaultValues: { skills: [], salary: { min: 0, max: 0 } },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="fullName">Nom complet</label>
        <input id="fullName" {...register('fullName')} />
        {errors.fullName && <span role="alert">{errors.fullName.message}</span>}
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register('email')} />
        {errors.email && <span role="alert">{errors.email.message}</span>}
      </div>
      <div>
        <label htmlFor="years">Experience (annees)</label>
        <input id="years" type="number" {...register('yearsOfExperience', { valueAsNumber: true })} />
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Envoi...' : 'Enregistrer'}
      </button>
    </form>
  );
}
```

---

## Vue + Vee-Validate + Yup

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import * as yup from 'yup';

const schema = yup.object({
  fullName: yup.string().required().min(2),
  email: yup.string().required().email(),
});

const { handleSubmit, errors, defineField } = useForm({ validationSchema: schema });
const [fullName, fullNameAttrs] = defineField('fullName');
const [email, emailAttrs] = defineField('email');

const onSubmit = handleSubmit(async (values) => { /* submit */ });
</script>

<template>
  <form @submit="onSubmit">
    <input v-model="fullName" v-bind="fullNameAttrs" />
    <span v-if="errors.fullName">{{ errors.fullName }}</span>
    <input v-model="email" v-bind="emailAttrs" type="email" />
    <span v-if="errors.email">{{ errors.email }}</span>
    <button type="submit">Save</button>
  </form>
</template>
```

---

## Server-Side Validation (.NET)

```csharp
// FluentValidation
public class CreateCandidateValidator : AbstractValidator<CreateCandidateDto>
{
    public CreateCandidateValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MinimumLength(2);
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.YearsOfExperience).InclusiveBetween(0, 50);
    }
}
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Validate on blur + submit | Immediate feedback without being intrusive |
| Show errors near the field | Users don't look at top-of-form summaries |
| Use aria-invalid + aria-describedby | Screen reader accessibility |
| Validate server-side too | Client validation can be bypassed |
| Use schema validation | Single source of truth for rules |
