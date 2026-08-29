import { CondoApp } from "../components/condo-app";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

async function AuthenticatedCondoApp() {
  const user = await requireChatGPTUser("/");
  return <CondoApp identity={{ name: user.displayName, email: user.email }} />;
}

export default function Home() {
  return <AuthenticatedCondoApp />;
}
