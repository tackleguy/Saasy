"use client";
import * as RSwitch from "@radix-ui/react-switch";

export default function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full border border-white/10 bg-obsidian-500 transition-colors data-[state=checked]:border-gold/60 data-[state=checked]:bg-gold/25"
    >
      <RSwitch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-mist transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-gold" />
    </RSwitch.Root>
  );
}
