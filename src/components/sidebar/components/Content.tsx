'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Link,
  Menu,
  MenuButton,
  MenuList,
  Stack,
  Text,
  useColorModeValue,
  Avatar,
} from '@chakra-ui/react';
import NavLink from '@/components/link/NavLink';
import avatar4 from '/public/img/avatars/avatar4.png';
import { NextAvatar } from '@/components/image/Avatar';
import APIModal from '@/components/apiModal';
import Brand from '@/components/sidebar/components/Brand';
import Links from '@/components/sidebar/components/Links';
import SidebarCard from '@/components/sidebar/components/SidebarCard';
import { RoundedChart } from '@/components/icons/Icons';
import { PropsWithChildren, useEffect, useState } from 'react';
import { IRoute } from '@/types/navigation';
import { IoMdPerson } from 'react-icons/io';
import { FiLogOut } from 'react-icons/fi';
import { LuHistory } from 'react-icons/lu';
import { MdOutlineManageAccounts, MdOutlineSettings } from 'react-icons/md';
import { useSolidSession } from '@/contexts/SolidSessionContext';
import { useRouter } from 'next/navigation';

interface SidebarContent extends PropsWithChildren {
  routes: IRoute[];
  loadMessagesFromSolidPod: (name: string) => void;
  [x: string]: any;
}

function SidebarContent(props: SidebarContent) {
  const { routes, setApiKey, loadMessagesFromSolidPod } = props;
  const textColor = useColorModeValue('navy.700', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');
  const bgColor = useColorModeValue('white', 'navy.700');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const iconColor = useColorModeValue('navy.700', 'white');
  const gray = useColorModeValue('gray.500', 'white');
  const { session, isLoggedIn } = useSolidSession();
  const [username, setUsername] = useState('Guest');
  const router = useRouter();
  const { logout } = useSolidSession();

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.clear();
      router.push('/sign-in');
    } catch (error) {
      console.error('Logout gagal:', error);
    }
  };

  useEffect(() => {
    if (isLoggedIn && session?.info?.webId) {
      try {
        const webId = session.info.webId;
        const url = new URL(webId);
        const pathParts = url.pathname.split('/').filter(Boolean);
        let extractedUsername = 'Solid User';

        if (pathParts.length > 0) {
          let lastSegment = pathParts[pathParts.length - 1];
          if (lastSegment.includes('#')) {
            lastSegment = lastSegment.split('#')[0];
          }
          if (lastSegment === 'card' && pathParts.length > 1) {
            lastSegment = pathParts[pathParts.length - 2];
          }
          if (lastSegment && lastSegment !== 'profile') {
            extractedUsername = lastSegment;
          }
        }

        setUsername(extractedUsername);
      } catch (error) {
        console.error('Error parsing WebID for username:', error);
        setUsername('Solid User');
      }
    } else {
      setUsername('Guest');
    }
  }, [isLoggedIn, session]);

  return (
    <Flex
      direction="column"
      height="100%"
      pt="20px"
      pb="26px"
      borderRadius="30px"
      maxW="285px"
      px="20px"
    >
      <Brand />
      <Stack direction="column" mb="auto" mt="8px">
        <Box ps="0px" pe={{ md: '0px', '2xl': '0px' }}>
          <Links routes={routes} loadMessagesFromSolidPod={loadMessagesFromSolidPod} />
        </Box>
      </Stack>

      <Flex alignItems="center" mb="20px">
        <Avatar
          name={username}
          bg="blue.500"
          color="white"
          size="sm"
          me="10px"
          fontWeight="bold"
          fontSize="xs"
        />
        <Text color={textColor} fontSize="xs" fontWeight="600">
          {username}
        </Text>
      </Flex>

      <Menu>
        <MenuButton
          as={Button}
          variant="transparent"
          aria-label=""
          border="1px solid"
          borderColor={borderColor}
          borderRadius="full"
          w="34px"
          h="34px"
          px="0px"
          p="0px"
          minW="34px"
          me="10px"
          justifyContent="center"
          alignItems="center"
          color={iconColor}
        >
          <Flex align="center" justify="center">
            <Icon as={MdOutlineSettings} width="18px" height="18px" />
          </Flex>
        </MenuButton>

        <MenuList
          ms="-20px"
          py="25px"
          ps="20px"
          pe="20px"
          w="246px"
          borderRadius="16px"
          transform="translate(-19px, -62px)!important"
          border="0px"
          boxShadow={shadow}
          bg={bgColor}
        >
          {/* Placeholder menu items */}
          <Box mb="20px">
            <Flex align="center" opacity="0.4" cursor="not-allowed">
              <Icon as={MdOutlineManageAccounts} me="12px" />
              <Text fontSize="sm" color={gray}>
                Profile Settings
              </Text>
            </Flex>
          </Box>

          <Box mb="20px">
            <Flex align="center" opacity="0.4" cursor="not-allowed">
              <Icon as={LuHistory} me="12px" />
              <Text fontSize="sm" color={gray}>
                History
              </Text>
            </Flex>
          </Box>

          <Box>
            <Flex align="center" opacity="0.4" cursor="not-allowed">
              <Icon as={IoMdPerson} me="12px" />
              <Text fontSize="sm" color={gray}>
                My Plan
              </Text>
            </Flex>
          </Box>
        </MenuList>
      </Menu>

      <Button
        variant="transparent"
        border="1px solid"
        borderColor={borderColor}
        borderRadius="full"
        w="34px"
        h="34px"
        px="0px"
        minW="34px"
        justifyContent="center"
        alignItems="center"
        onClick={handleLogout}
        mt="20px"
      >
        <Icon as={FiLogOut} width="16px" height="16px" />
      </Button>
    </Flex>
  );
}

export default SidebarContent;
