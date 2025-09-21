import { Image } from "lucide-react";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Section formulaire avec background mobile */}
      <div className="relative flex flex-col gap-4 p-6 md:p-10">
        {/* Background image pour mobile */}
        <div className="absolute inset-0 lg:hidden">
          <img
            src="/login_bg.jpg"
            alt="Background Login"
            className="h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
          />
          {/* Overlay blanc semi-transparent */}
          <div className="absolute inset-0 bg-white/90 dark:bg-black/90" />
        </div>

        {/* Contenu du formulaire */}
        <div className="relative z-10 flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Image className="size-4" />
            </div>
            ShareX Manager
          </a>
        </div>
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>

      {/* Image de côté pour desktop */}
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/login_bg.jpg"
          alt="Background Login"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
