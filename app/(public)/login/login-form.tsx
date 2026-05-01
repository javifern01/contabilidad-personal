"use client";

/**
 * Login form — Client Component.
 *
 * Uses React 19 form actions (form action={serverFn}) for progressive enhancement.
 * useFormStatus() provides the pending state for the submit button.
 * All copy is in Spanish per FND-05. Error messages per CONTEXT.md specifics.
 */

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction, type LoginActionResult } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

interface LoginFormProps {
  next?: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    const result: LoginActionResult = await loginAction(formData);
    if (result.ok) return; // Server Action redirects on success — this branch is unreachable
    switch (result.kind) {
      case "validation":
        setError("Correo electrónico o contraseña no válidos.");
        break;
      case "credentials":
        setError("Credenciales inválidas.");
        break;
      case "rate_limited":
        setError(
          `Demasiados intentos fallidos. Vuelve a intentarlo en ${result.retryAfterMin} ${result.retryAfterMin === 1 ? "minuto" : "minutos"}.`,
        );
        break;
      case "server_error":
      default:
        setError("No se pudo conectar. Inténtalo de nuevo.");
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-label="Correo electrónico"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-label="Contraseña"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
