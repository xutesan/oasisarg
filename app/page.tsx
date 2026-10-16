import { VT323 } from "next/font/google";
import Terminal from "@/components/terminal/Terminal";

const vt323 = VT323({ weight: "400", subsets: ["latin"] });

export default function Page() {
  return <Terminal fontFamily={`${vt323.style.fontFamily}, ui-monospace, monospace`} />;
}