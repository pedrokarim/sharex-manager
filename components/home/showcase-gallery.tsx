"use client";

import Image from "next/image";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { motion } from "@/components/home/motion";

export interface ShowcaseItem {
  src: string;
  alt: string;
  label?: string;
}

interface ShowcaseGalleryProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  items: ShowcaseItem[];
  ariaLabel?: string;
}

export const ShowcaseGallery = ({
  eyebrow = "Showcase",
  title,
  subtitle,
  items,
  ariaLabel = "Showcase",
}: ShowcaseGalleryProps) => {
  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        <Badge variant="secondary" className="mb-3">
          {eyebrow}
        </Badge>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">{subtitle}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-5xl"
      >
        <Carousel
          opts={{ align: "start", loop: true }}
          className="relative"
          aria-label={ariaLabel}
        >
          <CarouselContent>
            {items.map((item) => (
              <CarouselItem
                key={item.src}
                className="basis-full sm:basis-1/2 lg:basis-1/3"
              >
                <div className="group relative overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="relative aspect-[16/10]">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      priority={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/0 to-transparent" />
                  </div>

                  {item.label ? (
                    <div className="absolute left-3 top-3">
                      <Badge variant="secondary">{item.label}</Badge>
                    </div>
                  ) : null}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="hidden sm:flex" />
          <CarouselNext className="hidden sm:flex" />
        </Carousel>
      </motion.div>
    </section>
  );
};

