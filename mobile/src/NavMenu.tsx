import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from './constants/theme';

interface NavMenuProps {
  visible: boolean;
  activeScreen: 'lessons' | 'account';
  onClose: () => void;
  onGoMyLessons: () => void;
  onGoAccount: () => void;
  onLogout: () => void;
}

const DRAWER_WIDTH = 280;

export default function NavMenu({
  visible,
  activeScreen,
  onClose,
  onGoMyLessons,
  onGoAccount,
  onLogout,
}: NavMenuProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      slideAnim.setValue(DRAWER_WIDTH);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Piano Lesson</Text>
          <Text style={styles.drawerTitleAccent}>Companion</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.navSection}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={onGoMyLessons}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.navItemText,
                activeScreen === 'lessons' && styles.navItemTextActive,
              ]}
            >
              My Lessons
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.navSection}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={onGoAccount}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.navItemText,
                activeScreen === 'account' && styles.navItemTextActive,
              ]}
            >
              Account
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.flex} />

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.logoutItem}
          onPress={onLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingBottom: 32,
  },
  drawerHeader: {
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 24,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  drawerTitleAccent: {
    fontSize: 20,
    fontWeight: '300',
    color: COLORS.accent,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  navSection: {
    paddingVertical: 8,
  },
  navItem: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  navItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
    letterSpacing: 0.1,
  },
  navItemTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  flex: {
    flex: 1,
  },
  logoutItem: {
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
});
