import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("profile");

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Your account details and role.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id">User ID</Label>
            <Input id="id" value={session.user.id} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={session.user.name || ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={session.user.email || ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <div>
              <Badge variant="default" className="text-sm capitalize">{session.user.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
