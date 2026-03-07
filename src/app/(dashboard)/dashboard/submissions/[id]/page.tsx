import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SubmissionDetailPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Submission Detail</h2>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This page is under construction.</p>
        </CardContent>
      </Card>
    </div>
  );
}
