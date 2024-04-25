from    json                    import loads
import  plotly.graph_objects    as go
from    statistics              import mean, stdev
from    sys                     import argv


if __name__ == "__main__":

    fn  = argv[1]
    fig = go.Figure()

    with open("./metrics.json") as fd:

        recs    = [ loads(line) for line in fd ]
        metric  = [ rec["ms"] for rec in recs if rec["fn"] == fn ]

        print(f"{mean(metric):0.2f}\t{stdev(metric):0.2f}")

        fig.add_trace(go.Histogram(x = metric, nbinsx = 100))    

        fig.show()