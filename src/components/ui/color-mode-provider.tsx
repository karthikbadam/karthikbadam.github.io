"use client"

import { ThemeProvider } from "next-themes"
import type { ColorModeProviderProps } from "./color-mode"

export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    <ThemeProvider attribute="class" disableTransitionOnChange {...props} />
  )
} 