import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CardsForms() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upgrade your subscription</CardTitle>
        <CardDescription>
          You are currently on the free plan. Upgrade to the pro plan to get access to all features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="John Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="john@example.com" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-number">Card Number</Label>
          <Input id="card-number" placeholder="1234 5678 9012 3456" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan">Plan</Label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select the plan that best fits your needs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter Plan - Perfect for small businesses</SelectItem>
              <SelectItem value="pro">Pro Plan - More features and storage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox id="terms" />
          <Label htmlFor="terms" className="text-sm">
            I agree to the terms and conditions
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox id="newsletter" />
          <Label htmlFor="newsletter" className="text-sm">
            Allow us to send you emails
          </Label>
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1">
            Cancel
          </Button>
          <Button className="flex-1">
            Upgrade Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
