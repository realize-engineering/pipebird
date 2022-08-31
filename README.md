# Welcome to Pipebird

[![GitHub stars](https://img.shields.io/github/stars/pipebird/pipebird?style=social&label=Star)](https://GitHub.com/pipebird/pipebird/stargazers/) [![License](https://img.shields.io/static/v1?label=license&message=MIT&color=brightgreen)](https://github.com/pipebird/pipebird/tree/a9b1c6c0420550ad5069aca66c295223e0d05e27/LICENSE/README.md) <a href='http://makeapullrequest.com'><img alt='PRs Welcome' src='https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=shields'/></a> [![CodeQL](https://github.com/pipebird/pipebird/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/pipebird/pipebird/actions/workflows/codeql-analysis.yml) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/pipebird/pipebird) [![Slack](https://img.shields.io/badge/slack-Pipebird-brightgreen.svg?logo=slack)](https://join.slack.com/t/pipebirdcommunity/shared_invite/zt-1emvmxdk6-jBc9qXDDgeLhinJ8ktOgHg) [![Docs](https://img.shields.io/badge/Docs-readme-brightgreen.svg?)](https://docs.pipebird.com/reference/welcome-to-pipebird) [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Embed%20data%20pipelines%20in%20your%20product&url=https://pipebird.com/&via=getpipebird&hashtags=opensource,data,infrastructure,developers)

Pipebird is the **open source API used for deploying customer-facing data pipelines**. Pipebird requires minimal engineering effort to begin offering customers secure data pushes to their warehouses, directly from your product.

With Pipebird you can:
- select sources to push data from (such as PostgreSQL).
- let customers configure pipelines and apply transformations (such as type casting).
- periodically sync data directly to customers' warehouses (such as Snowflake).

Pipebird is for companies that want to share data directly, securely, and cost efficiently.
- **Minimize security and compliance risks** created by involving third-party ETL providers. Pipebird enables direct data sharing from your source to a customer's data warehouse. Your data never hits our servers.
- **Eliminate pipeline complexity for customers and partners.** Customers can trust verified pipelines offered directly from your product. It takes minutes to activate customer-defined pipelines using a declarative configuration language.
- **Internalize revenue previously captured by third-party ETL providers.** Rather than contracting a third-party, customers pay you for higher-quality data, ease of use, and security enhancements.

<p align="left">
  <a href="https://github.com/pipebird/pipebird">
    <img src="https://uploads-ssl.webflow.com/6219b67aebd6fd87049d2e0e/630f995f4fcbbc31c0a37f84_CustomerFlow.svg" width="700" alt="Customer flow">
  </a>

## Get started for free

Deploy on your own infrastructure and keep control of your data.

#### [Click here to view our deployment guide.](https://docs.pipebird.com/reference/quickstart)

Join the [Pipebird Slack Community](https://join.slack.com/t/pipebirdcommunity/shared_invite/zt-1emvmxdk6-jBc9qXDDgeLhinJ8ktOgHg) or email support@pipebird.com if you'd like help with your deployment.

## Product features

### Sources
Data originates from one of your company's sources, which can be any of:

- Postgres
- MySQL
- S3 [in progress]
- Redshift [in progress]
- etc.

### Destinations
Your customers can define their own destinations, which your team can configure through our Destinations API.
- CSV Export
- Snowflake
- Amazon S3
- Amazon Redshift [in progress]
- BigQuery [in progress]
- Databricks [in progress]

## Data transformers

Customers can choose to define some set of transformations to be applied on data by uploading Configurations which define mutations on the source data. For example, a consumer may want the Date column updated_at to be casted into a DateTime object in the destination.

We currently support renaming columns between sources and destinations and will be expanding destinations and working on transformations like:

- casting data types
- sums
- averages
- sorts
- groupby
- etc.

## Our goal for Pipebird

We believe that creating a data pipeline should be made as simple as pressing a button from a vendor's dashboard. 

Native, customer-facing data pipelines offer a more secure and efficient way for organizations to share data with one another. Companies like [Stripe](https://stripe.com/data-pipeline) and [Customer.io](https://customer.io/data-warehouse) have already invested in building out native data sharing features for their customers. **Pipebird is designed to help developers at any company quickly offer the same powerful data sharing features, increasing security and decreasing complexity for their customers.**

## Open source vs. paid versions

This repo is entirely [MIT licensed](/LICENSE), with the exception of the `ee` directory (if applicable).

Premium features (contained in the `ee` directory) require a Pipebird license. Contact us at sales@pipebird.com for more information, or see our [pricing page](https://pipebird.com/pricing).

Pipebird is entirely free for developers. We'll make money by charging larger companies that have more specific needs for additional features around security and scale.

Want to book a meeting with someone on our team? [Choose a time here!](https://calendly.com/pipebird)
