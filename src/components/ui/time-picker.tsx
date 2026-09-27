import * as React from "react";
import { Clock } from "lucide-react";
import { Label } from "./label";
import { Button } from "./button";
import { Input } from "./input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  disabled?: boolean;
  format?: "12h" | "24h";
  className?: string;
}

export function TimePicker({
  value = "00:00",
  onChange,
  label,
  disabled = false,
  format = "12h",
  className,
  ...props
}: TimePickerProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof TimePickerProps>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [hours, minutes] = value.split(":").map(Number);
  const [period, setPeriod] = React.useState<"AM" | "PM">(
    hours >= 12 ? "PM" : "AM"
  );
  const [selectedHour, setSelectedHour] = React.useState(
    format === "12h" ? hours % 12 || 12 : hours
  );
  const [selectedMinute, setSelectedMinute] = React.useState(minutes);
  const [view, setView] = React.useState<"hours" | "minutes">("hours");
  const [isDragging, setIsDragging] = React.useState(false);
  const clockRef = React.useRef<HTMLDivElement>(null);

  const displayHours =
    format === "12h" ? selectedHour : selectedHour.toString().padStart(2, "0");
  const displayMinutes = selectedMinute.toString().padStart(2, "0");

  const calculateValue = (clientX: number, clientY: number) => {
    if (!clockRef.current) return null;

    const rect = clockRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = clientX - centerX;
    const y = clientY - centerY;

    // Calcul de l'angle en degrés (0° est à droite, 90° en bas)
    let angle = Math.atan2(y, x) * (180 / Math.PI);

    // Ajustement pour que 0° soit en haut (à 12h sur l'horloge)
    angle = (angle + 90) % 360;
    if (angle < 0) angle += 360;

    // Conversion de l'angle en valeur d'heure ou de minute
    let value;
    if (view === "hours") {
      // Pour les heures: 30° par heure (360° / 12)
      value = Math.round(angle / 30);
      if (value === 0 || value === 12) value = 12;
    } else {
      // Pour les minutes: 6° par minute (360° / 60)
      value = Math.round(angle / 6);
      if (value === 60) value = 0;
    }

    return value;
  };

  const handleClockClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const value = calculateValue(event.clientX, event.clientY);
    if (value === null) return;

    if (view === "hours") {
      setSelectedHour(value);
      setView("minutes");
    } else {
      setSelectedMinute(value);
    }
  };

  const handleMouseMove = React.useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;

      const value = calculateValue(event.clientX, event.clientY);
      if (value === null) return;

      if (view === "hours") {
        setSelectedHour(value);
      } else {
        setSelectedMinute(value);
      }
    },
    [isDragging, view]
  );

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleConfirm = () => {
    let finalHours = selectedHour;
    if (format === "12h") {
      if (period === "PM" && finalHours !== 12) finalHours += 12;
      if (period === "AM" && finalHours === 12) finalHours = 0;
    }
    onChange?.(`${finalHours.toString().padStart(2, "0")}:${displayMinutes}`);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setSelectedHour(format === "12h" ? hours % 12 || 12 : hours);
    setSelectedMinute(minutes);
    setPeriod(hours >= 12 ? "PM" : "AM");
    setIsOpen(false);
  };

  const renderClockMarkers = () => {
    const items = [];
    // Marqueurs pour les minutes/secondes
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
      const isHour = i % 5 === 0;
      const markerLength = isHour ? 10 : 5; // Réduit la longueur des marqueurs d'heures
      const markerWidth = isHour ? 2 : 1;
      const radius = 135; // Augmente le rayon pour placer les marqueurs à l'extérieur
      const innerRadius = radius - markerLength;

      const startX = innerRadius * Math.cos(angle);
      const startY = innerRadius * Math.sin(angle);

      items.push(
        <div
          key={`marker-${i}`}
          className={cn(
            "absolute",
            isHour ? "bg-muted-foreground" : "bg-muted-foreground/50"
          )}
          style={{
            width: `${markerWidth}px`,
            height: `${markerLength}px`,
            left: "50%",
            top: "50%",
            transform: `translate(${startX}px, ${startY}px) rotate(${
              angle * (180 / Math.PI) + 90
            }deg)`,
            transformOrigin: "top",
          }}
        />
      );
    }
    return items;
  };

  const renderClockNumbers = () => {
    const numbers = view === "hours" ? 12 : 60;
    const items = [];
    const radius = 110;

    for (
      let i = 0;
      i < (view === "hours" ? 12 : 60);
      i += view === "hours" ? 1 : 5
    ) {
      const displayNumber = i === 0 ? (view === "hours" ? 12 : 0) : i;
      const angle = (i / numbers) * 2 * Math.PI - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const isSelected =
        view === "hours"
          ? displayNumber === selectedHour
          : i === selectedMinute;

      items.push(
        <div
          key={i}
          className={cn(
            "absolute flex items-center justify-center rounded-full",
            "w-8 h-8 text-sm cursor-pointer transition-colors",
            isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
          style={{
            transform: `translate(${x}px, ${y}px)`,
            left: "50%",
            top: "50%",
            marginLeft: "-16px",
            marginTop: "-16px",
          }}
          onMouseDown={() => {
            if (view === "hours") {
              setSelectedHour(displayNumber);
              setView("minutes");
            } else {
              setSelectedMinute(i);
            }
            setIsDragging(true);
          }}
        >
          {displayNumber}
        </div>
      );
    }
    return items;
  };

  const renderClockHand = () => {
    const value = view === "hours" ? selectedHour : selectedMinute;
    // Calcul de l'angle pour la position de l'aiguille
    let angle;

    if (view === "hours") {
      // Pour les heures: 30° par heure, 12 correspond à 0°
      angle = ((value % 12) * 30 - 90) * (Math.PI / 180);
    } else {
      // Pour les minutes: 6° par minute, 0 correspond à 0°
      angle = (value * 6 - 90) * (Math.PI / 180);
    }

    const handLength = 95;
    return (
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: "2px",
          height: `${handLength}px`,
          background: "hsl(var(--primary))",
          transform: `rotate(${angle * (180 / Math.PI) - 90}deg)`,
          transformOrigin: "top",
          marginLeft: "-1px",
          marginTop: "-1px",
        }}
      >
        <div className="absolute -left-[5px] -top-[5px] w-[10px] h-[10px] rounded-full bg-primary" />
      </div>
    );
  };

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className={cn(
            "w-[240px] justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          onClick={() => setIsOpen(true)}
          disabled={disabled}
        >
          <Clock className="mr-2 h-4 w-4" />
          {value
            ? `${displayHours}:${displayMinutes} ${
                format === "12h" ? period : ""
              }`
            : "Sélectionner l'heure"}
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[400px] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Sélectionner l'heure</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="flex items-center justify-center gap-4 text-4xl mb-6">
              <div
                className={cn(
                  "cursor-pointer rounded-md px-2",
                  view === "hours" && "bg-primary text-primary-foreground"
                )}
                onClick={() => setView("hours")}
              >
                {displayHours}
              </div>
              <div>:</div>
              <div
                className={cn(
                  "cursor-pointer rounded-md px-2",
                  view === "minutes" && "bg-primary text-primary-foreground"
                )}
                onClick={() => setView("minutes")}
              >
                {displayMinutes}
              </div>
              {format === "12h" && (
                <div className="flex flex-col text-sm gap-1 ml-4">
                  <div
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1",
                      period === "AM" && "bg-primary text-primary-foreground"
                    )}
                    onClick={() => setPeriod("AM")}
                  >
                    AM
                  </div>
                  <div
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1",
                      period === "PM" && "bg-primary text-primary-foreground"
                    )}
                    onClick={() => setPeriod("PM")}
                  >
                    PM
                  </div>
                </div>
              )}
            </div>

            <div
              ref={clockRef}
              className="relative w-[280px] h-[280px] mx-auto rounded-full border select-none"
              onMouseDown={() => setIsDragging(true)}
              onClick={handleClockClick}
            >
              {renderClockMarkers()}
              {renderClockNumbers()}
              {renderClockHand()}
            </div>
          </div>
          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={handleCancel}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-primary text-primary-foreground"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
