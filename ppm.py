from json import loads
from sys  import argv


if __name__ == "__main__":

    fn   = f"./logs/{argv[1]}_log.txt"
    recs = sorted([ loads(line) for line in open(fn, "r") ], key = lambda rec: rec["ts"])

    for rec in recs:

        ts          = f'{rec["ts"]:40}'
        formatted   = [ f"{rec[key]:<20}" for key in rec.keys() if key != "ts" ]

        print(ts + "".join(formatted))