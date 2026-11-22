import ContactChannels from "@/components/contact-channels";
import ContentPage from "@/components/content-page";

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact"
      intro="How to reach Rabby. Only verified contact details are shown here — a channel with no detail yet is labelled as not provided."
    >
      <ContactChannels />
    </ContentPage>
  );
}
