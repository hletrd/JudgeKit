import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("profile");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>{t("userProfile")}</CardTitle>
          <CardDescription>{t("userProfileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id">{t("userId")}</Label>
            <Input id="id" value={session.user.id} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">{t("username", { fallback: "Username" })}</Label>
            <Input id="username" value={session.user.username} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <div>
              <Badge variant="default" className="text-sm capitalize">{session.user.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("editProfile", { fallback: "Edit Profile" })}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm initialName={session.user.name || ""} initialEmail={session.user.email || ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("changePassword", { fallback: "Change Password" })}</CardTitle>
          <CardDescription>{t("changePasswordDesc", { fallback: "Update your account password for security." })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/change-password">
            <Button variant="outline">{t("changePasswordBtn", { fallback: "Change Password" })}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
