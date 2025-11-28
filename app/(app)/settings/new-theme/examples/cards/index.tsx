import { CardsCalendar } from "./calendar";
import { CardsChat } from "./chat";
import { CardsCreateAccount } from "./create-account";
import { CardsForms } from "./forms";
import { CardsStats } from "./stats";

export default function CardsDemo() {
  return (
    <div className="grid gap-4 p-4">
      <CardsStats />

      <div className="grid gap-4 md:grid-cols-2">
        <CardsCalendar />
        <CardsForms />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardsCreateAccount />
        <CardsChat />
      </div>
    </div>
  );
}
