import { changePasswordAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function ChangePasswordPage(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-4 py-8">
      <PageHeader
        title="Change password"
        description="Enter your current password, then pick a new one."
        back={{ href: "/protected", label: "Dashboard" }}
      />

      <Card>
        <CardContent className="p-6">
          <form className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={6}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={6}
                required
              />
            </div>

            <SubmitButton
              formAction={changePasswordAction}
              className="w-full"
              pendingText="Updating..."
            >
              Change password
            </SubmitButton>

            <FormMessage message={searchParams} />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
