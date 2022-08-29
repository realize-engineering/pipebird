<!-- PIPEBIRD LOGO -->
<p align="center">
  <a href="https://github.com/pipebird/pipebird">
    <img src="https://uploads-ssl.webflow.com/6219b67aebd6fd87049d2e0e/630a5bad9da42615ec6a9649_readmeimage.svg" width="600" alt="Pipebird Logo">
  </a>

  <p align="center">
   <br />
    Offer your customers secure pipelines to their data warehouses, directly from your product.
    <br />
    <br />
    <a href="https://join.slack.com/t/pipebirdcommunity/shared_invite/zt-1emvmxdk6-jBc9qXDDgeLhinJ8ktOgHg">Slack</a>
    ·
    <a href="https://pipebird.com/">Website</a>
    ·
    <a href="https://docs.pipebird.com/reference/welcome-to-pipebird">Docs</a>
  </p>
</p>

## Direct, secure, and cost efficient data sharing

![GitHub Repo stars](https://img.shields.io/github/stars/Pipebird/pipebird?style=social) [![License](https://img.shields.io/static/v1?label=license&message=MIT&color=brightgreen)](https://github.com/pipebird/pipebird/tree/a9b1c6c0420550ad5069aca66c295223e0d05e27/LICENSE/README.md) <a href='http://makeapullrequest.com'><img alt='PRs Welcome' src='https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=shields'/></a>

Pipebird is open source infrastructure that enables businesses to share data directly to their customers' data warehouses or databases.

Once integrated, Pipebird eliminates the need for your customers to use a third-party ETL provider or build their own pipelines to access data from your product.

## Benefits of offering native data pipelines

- **Minimize security and compliance risks** created by involving third-party ETL providers. Pipebird lets you send product data directly to a customer's data warehouse without involving a third-party. Your data never hits our servers.
- **Eliminate pipeline complexity for customers and partners.** Customers can use verified pipelines directly from your product. It only takes minutes to create customer-defined pipelines using a declarative configuration language.
- **Internalize revenue previously captured by third-party ETL providers.** Your customers can continue their relationship with you rather than paying a third-party.

## Our goal for Pipebird

We believe that verified, native product data pipelines offer a more secure and efficient way for companies to retrieve data from their vendors and partners. We've already started seeing major companies like [Stripe](https://stripe.com/data-pipeline) and [Customer.io](https://customer.io/data-warehouse) invest in building out native data sharing features for their customers.

**Our goal is to make it easy for any company to offer the same powerful data sharing features in just a few of hours, increasing security and decreasing complexity for their customers.**

## Get started for free

Pipebird is designed to be deployed on your own infrastructure so that you keep control of your data.

### [Deploy Pipebird to an EC2 instance within your existing AWS VPC](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?templateURL=https://s3-external-1.amazonaws.com/cf-templates-lglxt2zjl1jo-us-east-1/pipebird_existing_cloud_deploy&stackName=pipebird&param_licenseKey=lk_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff).

## Sources

Data originates from one of your company's sources, which can be any of:

- S3
- MySQL
- Postgres
- Redshift
- etc.

## Destinations

Your customers can define their own destinations, which your team can configure through our Destinations API. For example, a consumer may want you to pipe data directly into their own warehouse, or to an S3 bucket provisioned through Pipebird cloud for them to view their transformed data via a pre-signed URL.

Some common destinations include:

- Snowflake
- Amazon Redshift
- Amazon S3
- PostgreSQL
- BigQuery
- Databricks
- CSV export

If there are other destinations that you would like to see, please let us know in the [Pipebird Slack Community!](https://join.slack.com/t/pipebirdcommunity/shared_invite/zt-1emvmxdk6-jBc9qXDDgeLhinJ8ktOgHg)

## Data transformers

<img src="https://media.giphy.com/media/CRwUOHpwa9Lhe/giphy.gif" width="50%">

After your customers' define where they expect data to reach, they may define some set of transformations to be applied on this data in transit. They may do this by uploading Configurations which define mutations on the schema consumers want. For example, a consumer may want the Date column updated_at to be casted into a datetime object when it reaches the end data destination.

We support renaming columns and casting data types between sources and destinations, but will soon be expanding destinations and working on transformations like:

- sums
- averages
- sorts
- groupby
- etc.

These can be configured in a declarative format through a YAML config (or a UI can be created).

## Ready to get started?

See [Pipebird docs](https://docs.pipebird.com/reference/welcome-to-pipebird) to learn more about Pipebird functionality.

Join the [Pipebird Slack Community](https://join.slack.com/t/pipebirdcommunity/shared_invite/zt-1emvmxdk6-jBc9qXDDgeLhinJ8ktOgHg) if you want to chat with the team, share product ideas, or get help with something!

Email hello@pipebird.com if you want to reach us directly.

## Open source vs. paid versions

This repo is entirely [MIT licensed](/LICENSE), with the exception of the `ee` directory (if applicable).

Premium features (contained in the `ee` directory) require a Pipebird license. Contact us at sales@pipebird.com for more information, or see our [pricing page](https://pipebird.com/pricing).

## To close, why are we building this?

Data engineers spend a lot of their time building pipelines or contracting third-party ETL providers to get business data from vendors into their source of truth.

It's a big lift, having to solve for things like data quality, pipeline security, data transformation, cost optimization and more.

- Why can't we just press a button on our vendor's dashboard to create a secure, efficient data pipeline directly to our preferred warehouse?
- Why don't we create direct data relationships to ensure that we are continuosly receiving the highest quality data from a verified source?
- Why aren't all companies offering these features to improve the customer experience and even monetize their data?

That's what we've asked ourselves at Pipebird, and it's why we're building open source infrastructure to help developers give their companies the option to offer those benefits to their customers.

Want to chat with us to learn more? [Choose a time to speak with someone on our team!](https://calendly.com/pipebird)

<!-- markdownlint-restore -->
