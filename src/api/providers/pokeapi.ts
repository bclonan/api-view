import { defineApi } from "../defineApi";
export default defineApi({
  id: "pokeapi",
  name: "PokéAPI",
  description: "An encyclopedia with personality.",
  categories: ["Entertainment"],
  keywords: ["pokemon", "pokémon", "game", "entity"],
  icon: "circle-dot",
  docs: "https://pokeapi.co/docs/v2",
  operations: [
    {
      id: "pokemon",
      title: "Pokémon profile",
      description: "A Pokémon profile, base stats, and artwork.",
      endpoint: "https://pokeapi.co/api/v2/pokemon/",
      inputs: {
        name: { type: "string", label: "Name or number", default: "pikachu" },
      },
      buildUrl: (a) =>
        `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(String(a.name).toLowerCase())}`,
      extract: (r) => ({
        title: r.name,
        image_url:
          r.sprites.other?.["official-artwork"]?.front_default ??
          r.sprites.front_default,
        height: r.height,
        weight: r.weight,
        types: r.types.map((t: any) => t.type.name).join(", "),
        ...Object.fromEntries(
          r.stats.map((s: any) => [s.stat.name, s.base_stat]),
        ),
      }),
      sample: () => ({
        name: "pikachu",
        height: 4,
        weight: 60,
        sprites: {
          front_default:
            "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
        },
        types: [{ type: { name: "electric" } }],
        stats: [
          { stat: { name: "speed" }, base_stat: 90 },
          { stat: { name: "hp" }, base_stat: 35 },
        ],
      }),
      preferred: "record",
    },
  ],
});
