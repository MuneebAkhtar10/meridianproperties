import { KeyRound, Mail } from "lucide-react";

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function SignIn(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  return (
    <Card className="overflow-hidden border-border/60 shadow-lg shadow-black/5">
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-violet-600" />
      <CardContent className="p-8">
        <div className="mb-7 space-y-1.5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the account provided by your administrator.
          </p>
        </div>

        <form className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
            </div>
            <PasswordInput
              id="password"
              name="password"
              placeholder="Your password"
              required
            />
          </div>

          <SubmitButton
            formAction={signInAction}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm transition-opacity hover:opacity-90"
            pendingText="Signing in..."
          >
            Sign in
          </SubmitButton>

          <FormMessage message={searchParams} />
        </form>
      </CardContent>
    </Card>
  );
}
