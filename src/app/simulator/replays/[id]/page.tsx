import ReplayLibrary from "@/src/simulator/ReplayLibrary";
export default async function Page({params}: {params: Promise<{id: string}>}) {return <ReplayLibrary id={(await params).id}/>;}
