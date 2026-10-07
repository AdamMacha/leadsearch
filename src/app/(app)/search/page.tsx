import type { Metadata } from "next";
import { connection } from "next/server";
import { integrationStatus } from "@/lib/config";
import { SearchClient } from "./SearchClient";

export const metadata: Metadata = { title: "Hledat firmy" };
export const maxDuration = 60;

export default async function SearchPage() {
  await connection();
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Hledat firmy</h1>
          <p>Vyhledej firmy podle oboru a města, nech je zanalyzovat a seřadit podle toho, jak moc potřebují nový web.</p>
        </div>
      </header>
      <SearchClient placesReady={integrationStatus().places} />
    </div>
  );
}
