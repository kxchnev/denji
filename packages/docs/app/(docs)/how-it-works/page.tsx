import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Diagram } from "@/components/Diagram";
import { InlineCode } from "@/components/InlineCode";

export const metadata = {
  title: "How it works",
  description: "Why a diagram comes out the way it does: layers, clusters, corridors and sizes.",
};

const LAYERS = `architecture
  app web "Web"
  app api "API"
  app auth "Auth"
  database db "Postgres"
  queue bus "Events"
  web -> api
  web -> auth
  api -> db
  api -> bus
  auth -> db`;

const CLUSTERS = `architecture
  app gw "Gateway"
  app oapi "Orders API"
  database odb "Orders DB"
  app papi "Payments API"
  database pdb "Payments DB"
  gw -> oapi
  gw -> papi
  oapi -> odb
  papi -> pdb`;

const CORRIDOR = `architecture
  app edge "Edge"
  app one "One"
  app two "Two"
  database store "Store"
  edge -> one
  edge -> two
  one -> store
  two -> store
  edge -> store`;

const WIDTH = `architecture
  app a "A"
  app b "Storefront web service"
  database c "Order archive"
  queue d "Events"
  a -> b
  b -> c
  b -> d`;

function Section({
  id,
  title,
  children,
  dsl,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  dsl?: string;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
      {dsl && (
        <Card className="mt-4 overflow-hidden">
          <Diagram dsl={dsl} className="min-h-40 bg-card p-8" />
        </Card>
      )}
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">How it works</h1>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        Nothing here is something you write. It is what the engine does with what you wrote — worth
        ten minutes if you have ever looked at a drawing and wondered why it came out like that.
      </p>

      <Section id="layers" title="The connections are the layout" dsl={LAYERS}>
        <p className="mt-2 leading-7">
          Every scope is read as a graph and drawn in layers along its own flow: what feeds
          something comes before it, what it feeds comes after. Within a layer the order is chosen
          to keep connectors from crossing, and across the layer each node settles as close as it
          can to the middle of whatever it is attached to. A cycle in the connections is fine — the
          engine turns the back edges around to find the layers, then draws them the way they were
          written.
        </p>
        <p className="mt-4 leading-7">
          This is why the language has no coordinates. A position is only true of the diagram you
          measured it on; a constraint like{" "}
          <Link className="font-medium underline underline-offset-4" href="/reference#below">
            <InlineCode>@below</InlineCode>
          </Link>{" "}
          stays true when someone adds a service next year.
        </p>
      </Section>

      <Section id="clusters" title="Things that talk to each other are drawn together" dsl={CLUSTERS}>
        <p className="mt-2 leading-7">
          Before anything is laid out, the graph is cut into communities — groups of nodes that
          mostly talk to each other. Each is drawn as its own small picture, and the pictures are
          then arranged by the same machinery one level up. A flat layering spreads a whole document
          across the full width and puts related boxes far apart; on the diagram this engine was
          built for, clustering is the difference between 5.9 and 3.7 megapixels, with fewer
          crossings in the smaller one.
        </p>
      </Section>

      <Section id="corridors" title="Connectors get a corridor, not a gap to squeeze through" dsl={CORRIDOR}>
        <p className="mt-2 leading-7">
          A connection that skips a layer is given a stand-in node in every layer it crosses, and
          that stand-in takes up room like any box. So the corridor is not found afterwards — it is
          reserved while the boxes are being placed, which is why a long connection never has to
          cross something it has nothing to do with.
        </p>
        <p className="mt-4 leading-7">
          The router then walks each connection around the boxes, leaving and entering perpendicular
          to a side. Where several travel the same way they are spread across a bundle at a fixed
          pitch instead of landing on top of each other, and every bend on every connector is
          rounded by the same radius — an even rounding is what makes a turn read as a curve.
        </p>
      </Section>

      <Section id="sizes" title="One width for every shape" dsl={WIDTH}>
        <p className="mt-2 leading-7">
          A box is not sized to its own label. Each shape says how narrow it could be with its label
          on two lines, the widest answer wins, and every shape takes it — a row of boxes reads as a
          row rather than as a ragged edge. A word too long for that width is broken with a hyphen,
          because one <InlineCode>SparkApplicationController</InlineCode> should not widen every box
          in the picture. Setting{" "}
          <Link className="font-medium underline underline-offset-4" href="/reference#width">
            <InlineCode>@width</InlineCode>
          </Link>{" "}
          on a shape opts it out of both taking the shared width and helping decide it.
        </p>
        <p className="mt-4 leading-7">
          A database is a barrel: narrower than the rest, and its height comes from its width rather
          than from its text — sized to the text it came out a pancake. A queue is that barrel lying
          down. A container is sized last, from its laid-out children plus its padding, so it always
          hugs what it holds; a <InlineCode>width</InlineCode> on a container is a floor, not a
          size.
        </p>
      </Section>

      <Section id="hints" title="What a hint actually does">
        <p className="mt-2 leading-7">
          A hint is a constraint handed to the engine, not a position.{" "}
          <InlineCode>@rightOf</InlineCode> means <em>the same layer, in that order</em>;{" "}
          <InlineCode>@below</InlineCode> means <em>a later layer</em>. Which axis that turns into
          depends on the direction the drawing runs, so the words keep meaning what they say on the
          page. Write hints only where you care: every one is a constraint someone has to keep true
          as the diagram grows, and the connections have usually already answered the question.
        </p>
        <p className="mt-4 leading-7">
          Contradict yourself and nothing fails — the relations that close the cycle are dropped and{" "}
          <Link
            className="font-medium underline underline-offset-4"
            href="/diagnostics#hint-cycle"
          >
            <InlineCode>hint-cycle</InlineCode>
          </Link>{" "}
          tells you which.
        </p>
      </Section>

      <Section id="determinism" title="The same source gives the same drawing">
        <p className="mt-2 leading-7">
          Every step is deterministic: the clustering, the ordering, the coordinate solve and the
          routing. The same document renders byte-for-byte the same SVG on any machine, which is
          what makes a diagram reviewable in a pull request — a diff means something changed, not
          that it was rendered again.
        </p>
      </Section>
    </article>
  );
}
