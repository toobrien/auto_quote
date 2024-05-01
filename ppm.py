from json import loads


if __name__ == "__main__":

    recs = sorted([ loads(line) for line in open("./metrics.json", "r") ], key = lambda rec: rec["ts"])

    for rec in recs:

        ts          = f'{rec["ts"]:40}'
        formatted   = [ f"{rec[key]:<20}" for key in rec.keys() if key != "ts" ]

        print(ts + "".join(formatted))