import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "88 Bao Bao 运营中心 | 88 Bao Bao Ops",
  description: "Multi-store operations management for 88 Bao Bao",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
