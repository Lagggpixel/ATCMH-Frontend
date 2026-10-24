import JoinSession from "@/src/simulator/JoinSession";
export const metadata = {title: "Join a Sweatbox session"};
export default async function JoinPage({searchParams}: {searchParams: Promise<{code?: string}>}) {
  const {code} = await searchParams;
  return <JoinSession key={code ?? ""} code={typeof code === "string" ? code.slice(0, 200) : ""}/>;
}
