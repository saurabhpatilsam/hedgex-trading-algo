#!/usr/bin/env python3
"""
Test script to verify that bot control ACTUALLY works.
This tests the FIXED implementation with real thread control.
"""
import time
import threading
from app.services.bot_control.bot_thread_manager import bot_thread_manager


def mock_bot_function(bot_id: str, pause_event=None, stop_event=None, **kwargs):
    """
    Mock bot function that respects control events.
    """
    print(f"🚀 Bot {bot_id} started")
    
    iteration = 0
    while True:
        # Check stop signal
        if stop_event and stop_event.is_set():
            print(f"🛑 Bot {bot_id} stopping...")
            break
        
        # Check pause signal (wait if paused)
        if pause_event and not pause_event.is_set():
            print(f"⏸️ Bot {bot_id} paused at iteration {iteration}")
            pause_event.wait()  # Block until resumed
            print(f"▶️ Bot {bot_id} resumed")
        
        # Do work
        iteration += 1
        print(f"Bot {bot_id}: iteration {iteration}")
        time.sleep(1)
    
    print(f"✅ Bot {bot_id} completed")
    return f"Bot {bot_id} finished after {iteration} iterations"


def test_basic_control():
    """Test basic start, pause, resume, stop."""
    print("\n" + "="*60)
    print("TEST 1: Basic Control (Start -> Pause -> Resume -> Stop)")
    print("="*60)
    
    bot_id = "test_bot_1"
    
    # Start bot
    print(f"\n1. Starting bot {bot_id}...")
    success = bot_thread_manager.start_bot(bot_id, mock_bot_function)
    assert success, "Failed to start bot"
    print(f"✅ Bot started")
    
    # Let it run for 3 seconds
    time.sleep(3)
    
    # Pause bot
    print(f"\n2. Pausing bot {bot_id}...")
    success = bot_thread_manager.pause_bot(bot_id)
    assert success, "Failed to pause bot"
    print(f"✅ Bot paused")
    
    # Wait 3 seconds (bot should be paused, no output)
    print("   Waiting 3 seconds while paused (should see no iterations)...")
    time.sleep(3)
    
    # Resume bot
    print(f"\n3. Resuming bot {bot_id}...")
    success = bot_thread_manager.resume_bot(bot_id)
    assert success, "Failed to resume bot"
    print(f"✅ Bot resumed")
    
    # Let it run for 3 more seconds
    time.sleep(3)
    
    # Stop bot
    print(f"\n4. Stopping bot {bot_id}...")
    success = bot_thread_manager.stop_bot(bot_id)
    assert success, "Failed to stop bot"
    print(f"✅ Bot stopped")
    
    # Verify bot is gone from registry
    status = bot_thread_manager.get_bot_status(bot_id)
    assert status is None, f"Bot still in registry with status: {status}"
    print(f"✅ Bot removed from registry")
    
    print("\n✅ TEST 1 PASSED")


def test_multiple_bots():
    """Test controlling multiple bots simultaneously."""
    print("\n" + "="*60)
    print("TEST 2: Multiple Bots")
    print("="*60)
    
    # Start 3 bots
    bot_ids = ["test_bot_2", "test_bot_3", "test_bot_4"]
    
    print("\n1. Starting 3 bots...")
    for bot_id in bot_ids:
        success = bot_thread_manager.start_bot(bot_id, mock_bot_function)
        assert success, f"Failed to start {bot_id}"
        print(f"   ✅ Started {bot_id}")
    
    # Let them run
    time.sleep(2)
    
    # Pause bot 2 only
    print(f"\n2. Pausing only {bot_ids[0]}...")
    bot_thread_manager.pause_bot(bot_ids[0])
    print(f"   ✅ {bot_ids[0]} paused (others should continue)")
    
    time.sleep(3)
    
    # Stop all bots
    print("\n3. Stopping all bots...")
    for bot_id in bot_ids:
        bot_thread_manager.stop_bot(bot_id)
        print(f"   ✅ Stopped {bot_id}")
    
    # Check all are gone
    all_bots = bot_thread_manager.get_all_bots()
    assert len(all_bots) == 0, f"Bots still in registry: {all_bots}"
    
    print("\n✅ TEST 2 PASSED")


def test_force_kill():
    """Test force killing a bot."""
    print("\n" + "="*60)
    print("TEST 3: Force Kill")
    print("="*60)
    
    bot_id = "test_bot_5"
    
    # Start bot
    print(f"\n1. Starting bot {bot_id}...")
    bot_thread_manager.start_bot(bot_id, mock_bot_function)
    time.sleep(2)
    
    # Force kill
    print(f"\n2. Force killing bot {bot_id}...")
    success = bot_thread_manager.force_kill_bot(bot_id)
    assert success, "Failed to force kill"
    print(f"✅ Bot force killed")
    
    # Verify it's gone
    status = bot_thread_manager.get_bot_status(bot_id)
    assert status is None, f"Bot still has status: {status}"
    
    print("\n✅ TEST 3 PASSED")


def test_emergency_stop():
    """Test emergency stop all."""
    print("\n" + "="*60)
    print("TEST 4: Emergency Stop All")
    print("="*60)
    
    # Start multiple bots
    bot_ids = ["emergency_1", "emergency_2", "emergency_3"]
    
    print("\n1. Starting 3 bots...")
    for bot_id in bot_ids:
        bot_thread_manager.start_bot(bot_id, mock_bot_function)
        print(f"   ✅ Started {bot_id}")
    
    time.sleep(2)
    
    # Emergency stop all
    print("\n2. EMERGENCY STOP ALL...")
    bot_thread_manager.emergency_stop_all(timeout=3.0)
    print("✅ Emergency stop complete")
    
    # Verify all stopped
    all_bots = bot_thread_manager.get_all_bots()
    assert len(all_bots) == 0, f"Bots still running: {all_bots}"
    
    print("\n✅ TEST 4 PASSED")


def test_status_tracking():
    """Test status tracking."""
    print("\n" + "="*60)
    print("TEST 5: Status Tracking")
    print("="*60)
    
    bot_id = "status_test"
    
    # Start bot
    bot_thread_manager.start_bot(bot_id, mock_bot_function)
    
    # Check running status
    status = bot_thread_manager.get_bot_status(bot_id)
    print(f"1. After start: {status.value}")
    assert status.value == "running"
    
    # Pause and check status
    bot_thread_manager.pause_bot(bot_id)
    status = bot_thread_manager.get_bot_status(bot_id)
    print(f"2. After pause: {status.value}")
    assert status.value == "paused"
    
    # Resume and check status
    bot_thread_manager.resume_bot(bot_id)
    status = bot_thread_manager.get_bot_status(bot_id)
    print(f"3. After resume: {status.value}")
    assert status.value == "running"
    
    # Stop and check
    bot_thread_manager.stop_bot(bot_id)
    status = bot_thread_manager.get_bot_status(bot_id)
    print(f"4. After stop: {status}")
    assert status is None  # Should be removed from registry
    
    print("\n✅ TEST 5 PASSED")


def main():
    """Run all tests."""
    print("\n" + "🚀"*20)
    print("   BOT CONTROL SYSTEM TEST SUITE")
    print("   Testing REAL thread control")
    print("🚀"*20)
    
    try:
        test_basic_control()
        test_multiple_bots()
        test_force_kill()
        test_emergency_stop()
        test_status_tracking()
        
        print("\n" + "✅"*20)
        print("   ALL TESTS PASSED!")
        print("   Bot control system ACTUALLY WORKS!")
        print("✅"*20)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        # Clean up any remaining bots
        bot_thread_manager.emergency_stop_all()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        # Clean up any remaining bots
        bot_thread_manager.emergency_stop_all()
    finally:
        # Final cleanup
        bot_thread_manager.cleanup_dead_bots()
        print("\n🧹 Cleanup complete")


if __name__ == "__main__":
    main()
