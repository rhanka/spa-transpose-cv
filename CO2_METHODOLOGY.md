# CO2 Estimation Methodology

## Approach

CO2 per token is estimated using:
1. **Energy per token** (Wh) — derived from model size, proportional to Mistral Large 2 anchor
2. **Grid carbon intensity** (gCO2/kWh) — based on provider datacenter region

## Anchor Data

| Source | Data | Reference |
|--------|------|-----------|
| Mistral/ADEME/Carbone4 | Large 2 (123B params): 1.14 gCO2e / 400 output tokens, French grid | [Mistral environmental report](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai) |
| Google | Gemini median text query: 0.24 Wh, 0.03 gCO2e | [Hannah Ritchie, Aug 2025](https://hannahritchie.substack.com/p/ai-footprint-august-2025) |
| OpenAI | ChatGPT avg query: 0.34 Wh | [Sam Altman, 2025](https://hannahritchie.substack.com/p/ai-footprint-august-2025) |
| Anthropic | No published data | — |
| Cohere | No published data | — |

## Derivation

From Mistral anchor:
- 1.14 gCO2e / 400 tokens on French grid (~50 gCO2/kWh)
- Energy = 1.14 / 50 * 1000 = 22.8 Wh for 400 tokens
- **= 0.057 Wh per output token** for a 123B parameter model

Scaling rule (confirmed by Mistral report): "impacts are roughly proportional to model size"

## Grid Carbon Intensity by Provider Region

| Provider | Datacenter region | gCO2/kWh | Source |
|----------|------------------|----------|--------|
| Mistral AI | France (nuclear) | 50 | RTE/ADEME |
| OpenAI | US average | 390 | EPA eGRID |
| Anthropic | US (AWS) | 270 | AWS sustainability report |
| Cohere | US | 390 | EPA eGRID |
| Google | US (with PPAs) | 100 | Google environmental report |

## Per-Model Estimates

| Model | Est. params | Size ratio vs ML2 (123B) | Wh/1k output tokens | Grid gCO2/kWh | gCO2e/1k output tokens |
|-------|-------------|--------------------------|---------------------|---------------|------------------------|
| Mistral Large 2 *(ref)* | 123B | 1.00 | 0.057 | 50 | 2.85 |
| **Mistral Small 4** | ~22B | 0.18 | 0.010 | 50 | **0.51** |
| **GPT-5.4 Nano** | ~8B | 0.065 | 0.004 | 390 | **1.44** |
| **Claude Sonnet 4.6** | ~70B | 0.57 | 0.032 | 270 | **8.75** |
| **Command A Reasoning** | ~111B | 0.90 | 0.051 | 390 | **20.0** |
| **Gemini 3.1 Pro** | ~175B | 1.42 | 0.081 | 100 | **8.10** |

## LED Equivalence

A standard LED bulb (10W) consumes 10 Wh per hour = 0.01 kWh/h.
At French grid (50 gCO2/kWh): **0.5 gCO2 per hour of LED**.

We use **0.5 gCO2 per LED-hour** (French grid) as the comparison unit,
since Scalian is a French company.

Formula: `LED_minutes = gCO2_total / 0.5 * 60`

### Example per CV (~8k output tokens)

| Model | gCO2e est. | LED equivalent |
|-------|-----------|----------------|
| Mistral Small 4 | ~4g | ~8h LED |
| GPT-5.4 Nano | ~12g | ~24h LED |
| Gemini 3.1 Pro | ~65g | ~5.4j LED |
| Claude Sonnet 4.6 | ~70g | ~5.8j LED |
| Command A Reasoning | ~160g | ~13.3j LED |

## Caveats

- Model parameter counts are not public (except Mistral Large 2). Estimates based on industry analysis.
- Price is NOT used as compute proxy — model size ratio is more reliable.
- Reasoning/thinking tokens are counted as output tokens in the CO2 calculation.
- These are lifecycle estimates (training amortized + inference), per the Mistral methodology.
- Last updated: 2026-03-25
