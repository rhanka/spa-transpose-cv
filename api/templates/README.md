# Templates layout

`api/templates/tenants/`
- runtime assets actually loaded by the application for published tenants
- each tenant owns its `config.json`, `theme.css` and integrated `template.docx`

`api/templates/references/`
- source examples analyzed by `template-analysis-agent`
- these files document what was received from a company, or a fictionalized surrogate kept close to that source layout
- they are not the runtime templates used by the renderer

Rules:
- Scalian is the integrated runtime reference already normalized for the product; its source example still lives under `references/`
- CGI is not a committed runtime tenant seed; it is handled as a supplier example plus local draft artifacts during admin/builder tests
- raw customer files and private examples must stay out of git
- shared DOCX tooling lives under `api/src/services/`; command wrappers under `api/scripts/` are transitional only
