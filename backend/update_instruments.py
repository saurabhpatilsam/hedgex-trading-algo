import os
import sys

# Change to the current directory to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

def update_instruments():
    target_url = os.getenv("DATABASE_URL")
    if not target_url:
        print("❌ Set DATABASE_URL in .env")
        sys.exit(1)

    tgt_engine = create_engine(target_url, pool_pre_ping=True)
    TgtSession = sessionmaker(bind=tgt_engine)
    session = TgtSession()

    try:
        # Fetch current instruments
        rows = session.execute(text("SELECT id, symbol, contract_month FROM instruments")).fetchall()
        for row in rows:
            print(f"Current: {row.id} | {row.symbol} | {row.contract_month}")
            
            if row.contract_month:
                new_month = row.contract_month.upper()
                if new_month.endswith('H6'):
                    new_month = new_month.replace('H6', 'M6')
                elif new_month.endswith('G6'):
                    # Micro Gold uses M6 for June
                    new_month = new_month.replace('G6', 'M6')
                
                if new_month != row.contract_month:
                    session.execute(text("UPDATE instruments SET contract_month = :new_m WHERE id = :idx"), 
                                    {"new_m": new_month, "idx": row.id})
                    print(f"  -> Updated to: {new_month}")
                    
        session.commit()
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    update_instruments()
