import { constructMetadata } from '@/lib/metadata';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return constructMetadata({
    title: 'Impressum',
    description: 'Rechtliche Informationen und Kontakt.',
    locale,
    pathname: '/impressum',
  });
}

export default async function ImpressumPage() {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <h1>Impressum</h1>

      <h2>Angaben gem&auml;&szlig; &sect; 5 TMG</h2>
      <p>
        owen
        <br />
        1. Stock, Zimmer D, 43 Fanling Yuen Fung Street
        <br />
        North District, Hongkong
      </p>

      <h2>Kontakt</h2>
      <p>E-Mail: support@myclawgo.com</p>

      <h2>Redaktionell verantwortlich</h2>
      <p>
        owen
        <br />
        1. Stock, Zimmer D, 43 Fanling Yuen Fung Street
        <br />
        North District, Hongkong
      </p>

      <h2>EU-Streitschlichtung</h2>
      <p>
        Die Europ&auml;ische Kommission stellt eine Plattform zur
        Online-Streitbeilegung (OS) bereit:{' '}
        <a
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://ec.europa.eu/consumers/odr/
        </a>
        .
        <br />
        Unsere E-Mail-Adresse finden Sie oben im Impressum.
      </p>

      <h2>
        Verbraucher&shy;streit&shy;beilegung/Universal&shy;schlichtungs&shy;stelle
      </h2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
        vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </div>
  );
}
