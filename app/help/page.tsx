import ContentPage from "@/components/content-page";
import HelpFaq from "@/components/help-faq";

export default function HelpPage() {
  return (
    <ContentPage
      title="Help & FAQ"
      intro="Answers to the questions buyers ask before paying — delivery, payment, returns, stock and fit. Delivery and tax figures are demo configuration until the owner confirms the real values."
    >
      <HelpFaq />
    </ContentPage>
  );
}
