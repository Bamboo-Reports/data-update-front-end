import { redirect } from "next/navigation";
import { SCHEMA_LIST } from "@/lib/schema";

export default function Home() {
  redirect(`/${SCHEMA_LIST[0].id}`);
}
