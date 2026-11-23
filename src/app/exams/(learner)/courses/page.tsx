import {permanentRedirect} from "next/navigation";

export default function LegacyCoursesRedirectPage() {
  permanentRedirect("/ground-school");
}
