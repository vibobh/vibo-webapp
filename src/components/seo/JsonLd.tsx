import {
  DEFAULT_DESCRIPTION,
  absoluteUrl,
  getSocialSameAs,
  ogImageAbsoluteUrl,
  SITE_URL,
} from "@/lib/seo";

function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function JsonLd() {
  const logoUrl = absoluteUrl("/icon.png");
  const imageUrl = ogImageAbsoluteUrl();
  const sameAs = getSocialSameAs();
  const sameAsField = sameAs.length > 0 ? { sameAs } : {};

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Vibo",
          alternateName: "فايبو",
          applicationCategory: "SocialNetworkingApplication",
          operatingSystem: "iOS, Android, Web",
          description: DEFAULT_DESCRIPTION,
          url: SITE_URL,
          image: imageUrl,
          logo: logoUrl,
          ...sameAsField,
        }}
      />
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Vibo",
          url: SITE_URL,
          logo: logoUrl,
          ...sameAsField,
        }}
      />
    </>
  );
}
