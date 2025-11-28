import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send } from "lucide-react";

export function CardsChat() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src="/avatars/sofia-davis.jpg" />
            <AvatarFallback>SD</AvatarFallback>
          </Avatar>
          Sofia Davis
        </CardTitle>
        <CardDescription>New message</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-6 w-6">
              <AvatarImage src="/avatars/sofia-davis.jpg" />
              <AvatarFallback className="text-xs">SD</AvatarFallback>
            </Avatar>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              Hi, how can I help you today?
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">U</AvatarFallback>
            </Avatar>
            <div className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              Hey, I'm having trouble with my account.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Avatar className="h-6 w-6">
              <AvatarImage src="/avatars/sofia-davis.jpg" />
              <AvatarFallback className="text-xs">SD</AvatarFallback>
            </Avatar>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              What seems to be the problem?
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">U</AvatarFallback>
            </Avatar>
            <div className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              I can't log in.
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Input placeholder="Type your message..." className="flex-1" />
          <Button size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
